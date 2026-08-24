### 1.6.5 单目相机仿真\(C++\)

#### 1.发布方实现

功能包cpp03\_camera的src目录下，新建C++文件sim\_camera.cpp，并编辑文件，输入如下内容：

```cpp
/*
    需求：模拟相机，发布一张图片。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建图片发布方；
          3-2.创建定时器循环发布图片。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/image.hpp"

using namespace std::chrono_literals;
// 3.自定义节点类；
class SimCamera: public rclcpp::Node{
public:
    SimCamera():Node("sim_samera_node_cpp"){
        // 3-1.创建图片发布方；
        image_pub_ = this->create_publisher<sensor_msgs::msg::Image>("/image",10);
        // 3-2.创建定时器循环发布图片。
        timer_ = this->create_wall_timer(1s,std::bind(&SimCamera::on_timer,this));
    }
private:
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr image_pub_;
    rclcpp::TimerBase::SharedPtr timer_;
    void on_timer(){
      // 组织数据
      auto image = sensor_msgs::msg::Image();
      image.header.stamp = this->now();
      image.header.frame_id = "camera";

      image.encoding = "rgb8";
      image.height = 480;
      image.width = 640;

      image.step = image.width * 3;

      std::vector<uint8_t> data(image.width * image.height * 3, 0);
      size_t block = data.size() / 3;
      for (size_t i = 0; i < block; i += 3)
      {
         data[i] = 255;
         data[i+1] = 0;
         data[i+2] = 0;
      }
      for (size_t i = block; i < block *  2; i += 3)
      {
         data[i] = 0;
         data[i+1] = 255;
         data[i+2] = 0;
      }
      for (size_t i = block * 2; i < data.size(); i += 3)
      {
         data[i] = 0;
         data[i+1] = 0;
         data[i+2] = 255;
      }
      image.data = data;

      // 发布
      image_pub_->publish(image);
    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<SimCamera>());
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

add_executable(sim_camera src/sim_camera.cpp)

ament_target_dependencies(
  sim_camera
  "rclcpp"
  "sensor_msgs"
)

install(TARGETS sim_camera 
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp03_camera
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp03_camera sim_camera
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，添加image插件并将话题设置为"/image"，最终运行结果与演示案例类似。

