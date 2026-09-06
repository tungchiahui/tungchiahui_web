### 1.5.9 多线激光雷达仿真\(C++\)

#### 1.发布方实现

功能包cpp02\_laser的src目录下，新建C++文件sim\_laser.cpp，并编辑文件，输入如下内容：

```cpp
/*
    需求：发布点云数据，点云共50行100列，且可以沿X轴周期性运动。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建发布方；
          3-2.创建定时器；
          3-3.组织并发布数据。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/point_cloud2.hpp"
#include "sensor_msgs/msg/point_field.hpp"
#include "cstring"

using namespace std::chrono_literals;
// 3.自定义节点类；
class LaserPublisher: public rclcpp::Node{
public:
    LaserPublisher():Node("laser_publisher_node_cpp"){
        counter = 0;
        publisher = this->create_publisher<sensor_msgs::msg::PointCloud2>("/pcl",10);
        timer = this->create_wall_timer(0.1s,std::bind(&LaserPublisher::on_timer,this));

    }
private:
    rclcpp::Publisher<sensor_msgs::msg::PointCloud2>::SharedPtr publisher;
    rclcpp::TimerBase::SharedPtr timer;
    int counter; // 计数器
    void on_timer(){

        // 创建点云对象
        auto pcl = sensor_msgs::msg::PointCloud2();

        // 设置点云消息标头(时间戳与坐标系)
        pcl.header.stamp = this->get_clock()->now();
        pcl.header.frame_id = "laser";

        // 设置点云宽度与高度
        pcl.height = 50;
        pcl.width = 100;

        // 设置点云坐标点属性
        auto x = sensor_msgs::msg::PointField();
        x.name = "x";
        x.offset = 0;
        x.count = 1;
        x.datatype = sensor_msgs::msg::PointField::FLOAT32;
        auto y = sensor_msgs::msg::PointField();
        y.name = "y";
        y.offset = 4;
        y.count = 1;
        y.datatype = sensor_msgs::msg::PointField::FLOAT32;
        auto z = sensor_msgs::msg::PointField();
        z.name = "z";
        z.offset = 8;
        z.count = 1;
        z.datatype = sensor_msgs::msg::PointField::FLOAT32;
        auto in = sensor_msgs::msg::PointField();
        in.name = "intensity";
        in.offset = 12;
        in.count = 1;
        in.datatype = sensor_msgs::msg::PointField::FLOAT32;

        pcl.fields.push_back(x);
        pcl.fields.push_back(y);
        pcl.fields.push_back(z);
        pcl.fields.push_back(in);

        // 设置每个点的长度
        pcl.point_step = 16;
        // 设置一行的长度
        pcl.row_step = pcl.point_step * pcl.width;
        // 是否有无效点
        pcl.is_dense = false;
        // 是否为大端字节序
        pcl.is_bigendian = false;

        // 生成点云数据
        pcl.data.resize(pcl.row_step * pcl.height);
        std::vector<float> points(pcl.height * pcl.width * 4);

        for (uint32_t i = 0; i < pcl.height; i++)
        {
            for (uint32_t j = 0; j < pcl.width; j++)
            {
                int index = (i * pcl.width + j) * 4;
                points[index] = 1.0 - counter % 30 * 0.02;
                points[index + 1] = 1.0 - 0.02 * j;
                points[index + 2] = 1.0 - 0.02 * i;
                points[index + 3] = i * j;
            }

        }
        std::memcpy(&(pcl.data[0]),points.data(),pcl.data.size());

        // 发布
        publisher->publish(pcl);
        counter++;

    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<LaserPublisher>());
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
<depend>sensor_msgs</depend>
```

##### 2.CMakeLists.txt {#2cmakeliststxt}

CMakeLists.txt 中核心配置如下：

```
# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)

add_executable(sim_laser src/sim_laser.cpp)

ament_target_dependencies(
  sim_laser
  "rclcpp"
  "sensor_msgs"
)

install(TARGETS sim_laser
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp02_laser
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp02_laser sim_laser
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为laser，添加点云消息插件PointCloud2并将话题设置为pcl，最终运行结果与演示案例类似。

