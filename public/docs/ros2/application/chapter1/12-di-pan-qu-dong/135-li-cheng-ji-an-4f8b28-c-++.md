### 1.4.5 里程计案例\(C++\)

#### 1.源文件

功能包cpp00\_odom的src目录下，新建C++文件odom2path.cpp，并编辑文件，输入如下内容：

```cpp
/*
    需求：订阅机器人的里程计数据，生成并发布机器人的运行轨迹。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建订阅方，订阅里程计消息；
          3-2.创建发布方，发布轨迹信息。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "nav_msgs/msg/odometry.hpp"
#include "nav_msgs/msg/path.hpp"
#include "geometry_msgs/msg/pose_stamped.hpp"
#include "geometry_msgs/msg/pose.hpp"

using namespace std::placeholders;
// 3.自定义节点类；
class Odom2Path: public rclcpp::Node{
public:
    Odom2Path():Node("odom2path_node_cpp"){
        // 将原点添加进路径
        append_last_pose();
        // 3-1.创建订阅方，订阅里程计消息；
        odom_sub_ = this->create_subscription<nav_msgs::msg::Odometry>("/odom",10,std::bind(&Odom2Path::odom_cb,this,_1));
        // 3-2.创建发布方，发布轨迹信息。
        path_pub_ = this->create_publisher<nav_msgs::msg::Path>("/path",10);

    }
private:
    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odom_sub_;
    rclcpp::Publisher<nav_msgs::msg::Path>::SharedPtr path_pub_;
    std::vector<geometry_msgs::msg::PoseStamped> poses; // 用于保存路径中的途经点的集合
    geometry_msgs::msg::Pose last_pose; // 集合中最后一个途经点的位姿信息

    void odom_cb(const nav_msgs::msg::Odometry::SharedPtr odom){
        // 获取当前位姿信息
        auto current_pose = odom->pose.pose;
        // 计算与上一位姿之间的直线距离
        double distance = get_distance(current_pose);
        // 如果符合条件(直线距离大于40cm)，就组织新的轨迹信息
        if (distance >= 0.4)
        {
            last_pose = current_pose;
            append_last_pose(); // 将当前途经点添加进集合
        }
        // 周期性发布轨迹信息，无论是否添加了新的途经点数据
        publish_path();

    }
    // 将点添加进数组
    void append_last_pose(){
        // 组织PoseStamped数据
        auto ps = geometry_msgs::msg::PoseStamped();
        ps.header.stamp = this->now();
        ps.header.frame_id = "odom";
        ps.pose = last_pose;
        // 追加进集合
        poses.push_back(ps);
    }
    // 发布路径
    void publish_path(){

        // 组织Path数据
        auto path_msg = nav_msgs::msg::Path();
        path_msg.header.stamp = this->now();
        path_msg.header.frame_id = "odom";
        path_msg.poses = poses;
        // 发布
        path_pub_->publish(path_msg);
    }
    // 获取当前位姿与集合中最后一个途经点的直线距离
    double get_distance(const geometry_msgs::msg::Pose& current_pose){
        double dx = current_pose.position.x - last_pose.position.x;
        double dy = current_pose.position.y - last_pose.position.y;
        double distance =  sqrt(pow(dx,2) + pow(dy,2));
        return distance;
    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<Odom2Path>());
    // 5.资源释放。
    rclcpp::shutdown();
    return 0;
}
```

#### 2.编辑配置文件

##### 1.packages.xml {#1packagesxml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclcpp</depend>
<depend>nav_msgs</depend>
<depend>geometry_msgs</depend>
```

##### 2.CMakeLists.txt {#2cmakeliststxt}

CMakeLists.txt 中核心配置如下：

```
# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(nav_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)



add_executable(odom2path src/odom2path.cpp)

ament_target_dependencies(
  sim_laser
  "rclcpp"
  "nav_msgs"
  "geometry_msgs"
)

install(TARGETS odom2path
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp00_odom
```

#### 4.执行

请先按照之前介绍，启动机器人底盘以及键盘控制节点。

然后在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp00_odom odom2path
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为odom，添加Path插件并将话题设置为/path。当键盘控制机器人运动时，在rviz2中就会显示机器人的运动轨迹，其运行结果与演示案例类似。

